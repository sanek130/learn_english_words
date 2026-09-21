import mongoose from "mongoose";

export async function connectDb(uri) {
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }
  mongoose.set("strictQuery", true);
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  } catch (err) {
    const msg = err?.message || String(err);
    if (/bad auth|authentication failed/i.test(msg)) {
      console.error(`MongoDB auth failed. On Render set MONGODB_URI without quotes.
Example: mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/learn_words
Reset the DB user password in Atlas → Database Access if it still fails.
Do not wrap the value in "..." in the Render dashboard.`);
    }
    throw err;
  }
  console.log("MongoDB connected");
}
