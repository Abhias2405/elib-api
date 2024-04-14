import express from "express";
import createHttpError from "http-errors";
import globalErrorHandler from "./middlewares/globalErrorHandler";
import userRouter from "./user/userRouter";

const app = express();

//Routes

app.get("/", (req, res, next) => {
  const error = createHttpError(400, "Something went wrong.");
  throw error;
  
    res.json({ message: "Welcome to elib apis." });
});


app.use("/api/users",userRouter);



// Global error handler

app.use(globalErrorHandler);

export default app;
