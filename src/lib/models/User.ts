import mongoose, { Schema, Document, Model } from "mongoose";
import { defineModel } from "./define-model";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  /** bumped on password change / "sign out everywhere"; sessions carrying an older value are rejected */
  sessionVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name:           { type: String, required: true, trim: true },
    email:          { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash:   { type: String, required: true },
    sessionVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const User: Model<IUser> = defineModel<IUser>("User", UserSchema);
