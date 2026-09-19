import path from "node:path";
import dotenv from "dotenv";

// Side-effect module: import it first so process.env is populated before anything reads it.
dotenv.config({ path: path.resolve(import.meta.dirname, "../.env"), quiet: true });
