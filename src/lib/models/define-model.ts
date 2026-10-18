import mongoose, { Model, Schema } from "mongoose";

/**
 * Register a model, replacing a stale one in development.
 *
 * Next.js hot-reloads model files, but mongoose keeps compiled models on its
 * singleton. Reusing `mongoose.models[name]` would keep the OLD schema, and
 * mongoose silently drops fields the old schema doesn't know (e.g. a newly
 * added organizationId never gets saved).
 */
export function defineModel<T>(name: string, schema: Schema<T>): Model<T> {
  if (process.env.NODE_ENV !== "production" && mongoose.models[name]) {
    mongoose.deleteModel(name);
  }
  return (mongoose.models[name] as Model<T> | undefined) ?? mongoose.model<T>(name, schema);
}
