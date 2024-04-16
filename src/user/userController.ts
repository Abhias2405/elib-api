import { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import bcrypt from "bcrypt";
import userModel from "./userModel";
import { sign } from "jsonwebtoken";
import { config } from "../config/config";
import { User } from "./userTypes";

const createUser = async (req: Request, res: Response, next: NextFunction) => {
  const { name, email, password } = req.body;

  // Validation
  if (!name || !email || !password) {
    const error = createHttpError(400, "All fields are required");
    return next(error);
  }

  try {
    // Check if user already exists
    const user = await userModel.findOne({ email });
    if (user) {
      const error = createHttpError(400, "User already exists with this email.");
      return next(error);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    let newUser: User;
    newUser = await userModel.create({
      name,
      email,
      password: hashedPassword,
    });

    // Generate JWT token
    const token = sign({ sub: newUser._id }, config.jwtSecret as string, {
      expiresIn: "7d",
      algorithm: "HS256",
    });

    // Send response
    res.status(201).json({ accessToken: token });
  } catch (err) {
    if (err instanceof createHttpError.HttpError) {
      return next(err);
    }
    return next(createHttpError(500, "Internal server error."));
  }
};



export { createUser};
