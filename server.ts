import app from "./src/app";
import { config } from "./src/config/config";
import connectDB from "./src/config/db";

const startServer = async () => {
  try {
    // Connect to the database
    await connectDB();
    console.log("Database connection established.");

    const port = config.port || 3000;

    // Start the server
    app.listen(port, () => {
      console.log(`Server is listening on port: ${port}`);
    });
  } catch (error) {
    console.error("Failed to start the server:", error);
    process.exit(1); 
  }
};

startServer();
