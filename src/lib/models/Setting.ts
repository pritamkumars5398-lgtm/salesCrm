import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface ISetting extends Document {
  agentId: Types.ObjectId;
  key: string;
  value: string;
  updatedAt: Date;
}

const SettingSchema = new Schema<ISetting>(
  {
    agentId: { type: Schema.Types.ObjectId, ref: "Agent", required: true },
    key:     { type: String, required: true },
    value:   { type: String, required: true },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

SettingSchema.index({ agentId: 1, key: 1 }, { unique: true });

export const Setting: Model<ISetting> =
  mongoose.models.Setting ?? mongoose.model<ISetting>("Setting", SettingSchema);
