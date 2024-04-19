import path from "node:path";
import fs from "node:fs";
import { Request, Response, NextFunction } from "express";
import cloudinary from "../config/cloudinary";
import createHttpError from "http-errors";
import bookModel from "./bookModel";
import { AuthRequest } from "../middlewares/authenticate";

const createBook = async (req: Request, res: Response, next: NextFunction) => {
    const { title, genre, description } = req.body;

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const coverImageMimeType = files.coverImage[0].mimetype.split("/").at(-1);
    const fileName = files.coverImage[0].filename;
    const filePath = path.resolve(
        __dirname,
        "../../public/data/uploads",
        fileName
    );

    try {
        const uploadResult = await cloudinary.uploader.upload(filePath, {
            filename_override: fileName,
            folder: "book-covers",
            format: coverImageMimeType,
        });

        const bookFileName = files.file[0].filename;
        const bookFilePath = path.resolve(
            __dirname,
            "../../public/data/uploads",
            bookFileName
        );

        const bookFileUploadResult = await cloudinary.uploader.upload(
            bookFilePath,
            {
                resource_type: "raw",
                filename_override: bookFileName,
                folder: "book-pdfs",
                format: "pdf",
            }
        );

        const _req = req as AuthRequest;


        const newBook = await bookModel.create({
            title,
            description,
            genre,
            author: _req.userId,
            coverImage: uploadResult.secure_url,
            file: bookFileUploadResult.secure_url,
        });

        // Delete temp files
        try {
            await fs.promises.unlink(filePath);
            await fs.promises.unlink(bookFilePath);
        } catch (deleteError) {
            console.error("Error deleting temporary files:", deleteError);
        }

        res.status(201).json({ id: newBook._id });
    } catch (err) {
        console.error("Error during book creation:", err);
        return next(createHttpError(500, "Error while uploading the files."));
    }
};

const updateBook = async (req: Request, res: Response, next: NextFunction) => {
    const { title, description, genre } = req.body;
    const bookId = req.params.bookId;

    try {
        const book = await bookModel.findOne({ _id: bookId });

        if (!book) {
            return next(createHttpError(404, "Book not found"));
        }

        const _req = req as AuthRequest;
        if (book.author.toString() !== _req.userId) {
            return next(createHttpError(403, "You cannot update another's book."));
        }

        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        let completeCoverImage = book.coverImage;
        if (files.coverImage) {
            const filename = files.coverImage[0].filename;
            const converMimeType = files.coverImage[0].mimetype.split("/").at(-1);
            const filePath = path.resolve(
                __dirname,
                "../../public/data/uploads/" + filename
            );

            const uploadResult = await cloudinary.uploader.upload(filePath, {
                filename_override: filename,
                folder: "book-covers",
                format: converMimeType,
            });

            completeCoverImage = uploadResult.secure_url;
            await fs.promises.unlink(filePath);
        }

        let completeFileName = book.file;
        if (files.file) {
            const bookFilePath = path.resolve(
                __dirname,
                "../../public/data/uploads/" + files.file[0].filename
            );

            const uploadResultPdf = await cloudinary.uploader.upload(bookFilePath, {
                resource_type: "raw",
                filename_override: files.file[0].filename,
                folder: "book-pdfs",
                format: "pdf",
            });

            completeFileName = uploadResultPdf.secure_url;
            await fs.promises.unlink(bookFilePath);
        }

        const updatedBook = await bookModel.findOneAndUpdate(
            { _id: bookId },
            {
                title,
                description,
                genre,
                coverImage: completeCoverImage,
                file: completeFileName,
            },
            { new: true }
        );

        res.json(updatedBook);
    } catch (err) {
        console.error("Error during book update:", err);
        return next(createHttpError(500, "Error while updating the book."));
    }
};



export { createBook, updateBook};
