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
  minPoolSize: 2,
  maxIdleTimeMS: 30000,
  retryAttempts: 5,
  retryDelayMs: 2000,
};

export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private connectionPromise: Promise<typeof mongoose> | null = null;
  private isConnected = false;
  private options: ConnectionOptions;

  private constructor(options: ConnectionOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
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
      console.log('MongoDB connected successfully');
      this.isConnected = true;
    });

    mongoose.connection.on('error', (error) => {
      console.error('MongoDB connection error:', error);
      this.isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
      this.isConnected = false;
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await this.disconnect();
      process.exit(0);
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
    try {
      const connection = await mongoose.connect(this.options.uri, {
        maxPoolSize: this.options.maxPoolSize,
        minPoolSize: this.options.minPoolSize,
        maxIdleTimeMS: this.options.maxIdleTimeMS,
      });

      this.isConnected = true;
      this.connectionPromise = null;
      return connection;
    } catch (error) {
      console.error(`MongoDB connection attempt ${attempt} failed:`, error);

      if (attempt < (this.options.retryAttempts || 5)) {
        console.log(`Retrying in ${this.options.retryDelayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, this.options.retryDelayMs));
        return this.connectWithRetry(attempt + 1);
      }

      this.connectionPromise = null;
      throw new Error(`Failed to connect to MongoDB after ${attempt} attempts`);
    }
  }

  async disconnect(): Promise<void> {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      this.isConnected = false;
      console.log('MongoDB connection closed');
    }
  }

  getConnectionState(): number {
    return mongoose.connection.readyState;
  }

  isHealthy(): boolean {
    return this.isConnected && mongoose.connection.readyState === 1;
  }
}

// Export convenience function
export async function connectDatabase(uri: string): Promise<typeof mongoose> {
  const db = DatabaseConnection.getInstance({ uri });
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
