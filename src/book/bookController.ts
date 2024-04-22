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
        let oldCoverImagePublicId = '';
        if (files.coverImage) {
            // Extract and delete old cover image from Cloudinary
            if (book.coverImage) {
                const oldCoverFileSplits = book.coverImage.split("/");
                oldCoverImagePublicId =
                    oldCoverFileSplits.at(-2) +
                    "/" +
                    oldCoverFileSplits.at(-1)?.split(".").at(-2);
            }

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
        let oldBookFilePublicId = '';
        if (files.file) {
            // Extract and delete old book file from Cloudinary
            if (book.file) {
                const oldBookFileSplits = book.file.split("/");
                oldBookFilePublicId =
                    oldBookFileSplits.at(-2) +
                    "/" +
                    oldBookFileSplits.at(-1)?.split(".").at(-2);
            }

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

        // Delete old files from Cloudinary if new files were uploaded
        try {
            if (oldCoverImagePublicId) {
                await cloudinary.uploader.destroy(oldCoverImagePublicId);
            }
            if (oldBookFilePublicId) {
                await cloudinary.uploader.destroy(oldBookFilePublicId, {
                    resource_type: "raw",
                });
            }
        } catch (deleteError) {
            console.error("Error deleting old files from Cloudinary:", deleteError);
            // Non-critical error, so we continue with the update
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

const listBooks = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skipIndex = (page - 1) * limit;

        const totalBooks = await bookModel.countDocuments();
        const books = await bookModel
            .find()
            .populate("author", "name")
            .skip(skipIndex)
            .limit(limit);

        res.json({
            books,
            currentPage: page,
            totalPages: Math.ceil(totalBooks / limit),
            totalBooks
        });
    } catch (err) {
        console.error("Error during fetching books:", err);
        return next(createHttpError(500, "Error while fetching the books."));
    }
};

const getSingleBook = async (req: Request, res: Response, next: NextFunction) => {
    const bookId = req.params.bookId;

    try {
        const book = await bookModel
            .findOne({ _id: bookId })
            .populate("author", "name");
        
        if (!book) {
            return next(createHttpError(404, "Book not found."));
        }

        res.json(book);
    } catch (err) {
        console.error("Error during fetching book:", err);
        return next(createHttpError(500, "Error while fetching the book."));
    }
};

const deleteBook = async (req: Request, res: Response, next: NextFunction) => {
    const bookId = req.params.bookId;

    try {
        const book = await bookModel.findOne({ _id: bookId });
        if (!book) {
            return next(createHttpError(404, "Book not found"));
        }

        const _req = req as AuthRequest;
        if (book.author.toString() !== _req.userId) {
            return next(createHttpError(403, "You cannot delete another's book."));
        }

        const coverFileSplits = book.coverImage.split("/");
        const coverImagePublicId =
            coverFileSplits.at(-2) +
            "/" +
            coverFileSplits.at(-1)?.split(".").at(-2);

        const bookFileSplits = book.file.split("/");
        const bookFilePublicId =
            bookFileSplits.at(-2) +
            "/" +
            bookFileSplits.at(-1)?.split(".").at(-2);

        // Delete files from Cloudinary
        await cloudinary.uploader.destroy(coverImagePublicId);
        await cloudinary.uploader.destroy(bookFilePublicId, {
            resource_type: "raw",
        });

        // Delete book from database
        await bookModel.deleteOne({ _id: bookId });

        res.sendStatus(204);
    } catch (err) {
        console.error("Error during book deletion:", err);
        return next(createHttpError(500, "Error while deleting the book."));
    }
};

const getUserBooks = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const _req = req as AuthRequest;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skipIndex = (page - 1) * limit;

        const totalBooks = await bookModel.countDocuments({ author: _req.userId });
        const books = await bookModel
            .find({ author: _req.userId })
            .populate("author", "name")
            .skip(skipIndex)
            .limit(limit)
            .sort({ createdAt: -1 }); // Sort by newest first

        res.json({
            books,
            currentPage: page,
            totalPages: Math.ceil(totalBooks / limit),
            totalBooks,
        });
    } catch (err) {
        console.error("Error during fetching user books:", err);
        return next(createHttpError(500, "Error while fetching your books."));
    }
};

export { createBook, updateBook, listBooks, getSingleBook, deleteBook, getUserBooks };