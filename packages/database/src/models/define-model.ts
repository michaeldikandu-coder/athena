import { model, models, Model, Schema } from 'mongoose';

/**
 * Compile a model once per process. Next.js dev re-evaluates the API bundle
 * on every change while Mongoose keeps its model registry, so compiling the
 * same name twice ("Cannot overwrite model once compiled") must reuse it.
 */
export function defineModel<T>(name: string, schema: Schema<T>): Model<T> {
  return (models[name] as Model<T> | undefined) ?? model<T>(name, schema);
}
