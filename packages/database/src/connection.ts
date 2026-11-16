import mongoose from 'mongoose';

interface ConnectionOptions {
  uri: string;
  maxPoolSize?: number;
  minPoolSize?: number;
  maxIdleTimeMS?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
}

const DEFAULT_OPTIONS: Partial<ConnectionOptions> = {
  maxPoolSize: 10,
  minPoolSize: 0,
  maxIdleTimeMS: 30000,
  retryAttempts: 5,
  retryDelayMs: 2000,
};

/** Hide credentials in a MongoDB URI */
export function redactMongoUri(uri: string): string {
  return uri.replace(/(mongodb(?:\+srv)?:\/\/)[^@/]+@/, '$1***@');
}

/**
 * Turn common MongoDB connection failures into an actionable explanation
 */
export function explainMongoError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/SSL alert number 80|tlsv1 alert internal error/i.test(message)) {
    return 'MongoDB Atlas refused the TLS handshake. This almost always means this machine\'s IP address is not in the cluster\'s Network Access list (Atlas > Security > Network Access > Add IP Address).';
  }
  if (/bad auth|Authentication failed/i.test(message)) {
    return 'MongoDB rejected the username or password in MONGODB_URI.';
  }
  if (/ENOTFOUND|querySrv|ESERVFAIL|EAI_AGAIN/i.test(message)) {
    return 'The MongoDB host in MONGODB_URI could not be resolved. Check the cluster address and your DNS or network.';
  }
  if (/ECONNREFUSED/i.test(message)) {
    return 'Nothing is listening at the MongoDB address in MONGODB_URI. Is mongod running?';
  }
  if (/Server selection timed out|MongoServerSelectionError/i.test(message)) {
    return 'No MongoDB server answered in time. Check MONGODB_URI, network access, and that the cluster is not paused.';
  }
  return message.split('\n')[0];
}

export function isMongoUnavailableError(error: unknown): boolean {
  const name = (error as { name?: string })?.name ?? '';
  return /MongoServerSelectionError|MongoNetworkError|MongoNetworkTimeoutError|MongoNotConnectedError|MongoTopologyClosedError/.test(name);
}

let lastError: string | null = null;

/** Why the database is unavailable, or null when it is connected */
export function getDatabaseStatus(): { connected: boolean; reason: string | null } {
  const connected = mongoose.connection.readyState === 1;
  return { connected, reason: connected ? null : lastError ?? 'Not connected yet' };
}

export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private connectionPromise: Promise<typeof mongoose> | null = null;
  private isConnected = false;
  private options: ConnectionOptions;

  private constructor(options: ConnectionOptions) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)),
    } as ConnectionOptions;
    this.setupEventHandlers();
  }

  static getInstance(options?: ConnectionOptions): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      if (!options) {
        throw new Error('Database connection options required on first initialization');
      }
      DatabaseConnection.instance = new DatabaseConnection(options);
    }
    return DatabaseConnection.instance;
  }

  private setupEventHandlers(): void {
    mongoose.connection.on('connected', () => {
      console.log('MongoDB connected');
      this.isConnected = true;
      lastError = null;
    });
    mongoose.connection.on('error', (error) => {
      lastError = explainMongoError(error);
      console.error(`MongoDB error: ${lastError}`);
      this.isConnected = false;
    });
    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected');
      this.isConnected = false;
    });
  }

  async connect(): Promise<typeof mongoose> {
    if (this.isConnected && mongoose.connection.readyState === 1) {
      return mongoose;
    }
    if (this.connectionPromise) {
      return this.connectionPromise;
    }
    this.connectionPromise = this.connectWithRetry();
    return this.connectionPromise;
  }

  private async connectWithRetry(attempt = 1): Promise<typeof mongoose> {
    const max = this.options.retryAttempts || 5;
    try {
      const connection = await mongoose.connect(this.options.uri, {
        maxPoolSize: this.options.maxPoolSize,
        minPoolSize: this.options.minPoolSize,
        maxIdleTimeMS: this.options.maxIdleTimeMS,
        serverSelectionTimeoutMS: 10000,
        // Fail queries fast when the database is down instead of queueing them
        bufferCommands: false,
      });
      // Verify the server actually answers; a connect can succeed before TLS to the data nodes fails
      await connection.connection.db!.admin().ping();
      this.isConnected = true;
      this.connectionPromise = null;
      return connection;
    } catch (error) {
      const reason = explainMongoError(error);
      lastError = reason;
      console.error(`MongoDB connection attempt ${attempt}/${max} to ${redactMongoUri(this.options.uri)} failed: ${reason}`);
      await mongoose.disconnect().catch(() => undefined);

      if (attempt < max) {
        await new Promise((resolve) => setTimeout(resolve, this.options.retryDelayMs));
        return this.connectWithRetry(attempt + 1);
      }
      this.connectionPromise = null;
      throw new Error(`Could not connect to MongoDB after ${attempt} attempts. ${reason}`);
    }
  }

  async disconnect(): Promise<void> {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      this.isConnected = false;
    }
  }

  getConnectionState(): number {
    return mongoose.connection.readyState;
  }

  isHealthy(): boolean {
    return this.isConnected && mongoose.connection.readyState === 1;
  }
}

/**
 * Connect (or reuse the connection). Serverless callers pass retryAttempts: 1
 * so a request never waits through several retries.
 */
export async function connectDatabase(
  uri: string,
  options: { retryAttempts?: number; maxPoolSize?: number } = {}
): Promise<typeof mongoose> {
  const db = DatabaseConnection.getInstance({ uri, ...options });
  return db.connect();
}

export async function disconnectDatabase(): Promise<void> {
  const db = DatabaseConnection.getInstance();
  await db.disconnect();
}

export function getDatabaseHealth(): boolean {
  try {
    const db = DatabaseConnection.getInstance();
    return db.isHealthy();
  } catch {
    return false;
  }
}
