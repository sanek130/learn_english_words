import mongoose from "mongoose";

const pairSchema = new mongoose.Schema(
  {
    source: { type: String, required: true },
    target: { type: String, required: true },
    mastery: { type: Number, default: 0 },
    attempts: { type: Number, default: 0 },
    correct: { type: Number, default: 0 },
    almost: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    lastScore: { type: Number, default: 0 },
    lastPracticedAt: { type: Date, default: null },
  },
  { _id: true }
);

const wordListSchema = new mongoose.Schema(
  {
    userId: { type: Number, required: true, index: true },
    title: { type: String, required: true },
    sourceLang: { type: String, required: true },
    targetLang: { type: String, required: true },
    pairs: { type: [pairSchema], default: [] },
  },
  { timestamps: true }
);

const userSchema = new mongoose.Schema(
  {
    telegramId: { type: Number, required: true, unique: true },
    username: String,
    firstName: String,
    solvedTasks: { type: Number, default: 0 },
    correctAnswers: { type: Number, default: 0 },
    almostAnswers: { type: Number, default: 0 },
    totalAnswers: { type: Number, default: 0 },
    wizard: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

userSchema.virtual("accuracy").get(function accuracy() {
  if (!this.totalAnswers) return 0;
  return Math.round((this.correctAnswers / this.totalAnswers) * 100);
});

export const User = mongoose.model("User", userSchema);
export const WordList = mongoose.model("WordList", wordListSchema);

export async function getOrCreateUser(from) {
  const update = {
    username: from.username || "",
    firstName: from.first_name || "",
  };
  return User.findOneAndUpdate(
    { telegramId: from.id },
    { $set: update, $setOnInsert: { telegramId: from.id } },
    { upsert: true, new: true }
  );
}
