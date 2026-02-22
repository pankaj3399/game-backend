"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeSignUp = exports.appleAuthCallback = exports.appleAuth = exports.googleAuthCallback = exports.googleAuth = void 0;
const passport_1 = __importDefault(require("passport"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const session_1 = __importDefault(require("../models/session"));
const logs_1 = require("../utils/logs");
const user_1 = __importDefault(require("../models/user"));
const favorite_1 = __importDefault(require("../models/favorite"));
exports.googleAuth = passport_1.default.authenticate('google', {
    scope: ['profile', 'email']
});
const googleAuthCallback = (req, res, next) => {
    passport_1.default.authenticate('google', async (err, user) => {
        if (err || !user) {
            return res.status(500).json({ message: 'Authentication error', error: err?.message });
        }
        const isUser = await user_1.default.findOne({ email: user.email });
        // If user not exists
        if (!isUser) {
            return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?error=true`);
        }
        // If user exits but not signed up yet on the system
        if (isUser && !isUser?.alias && !isUser?.name && !isUser?.dateOfBirth && !isUser?.gender) {
            return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?signup=true&email=${user.email}`);
        }
        const token = jsonwebtoken_1.default.sign({ userId: isUser.hmacKey }, process.env.JWT_SECRET, { expiresIn: '7d' });
        const session = new session_1.default({
            token,
            user: isUser?._id
        });
        await session.save();
        res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?token=${token}`);
    })(req, res, next);
};
exports.googleAuthCallback = googleAuthCallback;
exports.appleAuth = passport_1.default.authenticate('apple', {
    scope: ['profile', 'email']
});
const appleAuthCallback = (req, res, next) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    passport_1.default.authenticate('apple', async (err, user) => {
        if (err || !user) {
            return res.status(500).json({ message: 'Authentication error', error: err?.message });
        }
        const isUser = await user_1.default.findOne({ appleId: user.appleId });
        // If user not exists
        if (!isUser) {
            return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?error=true`);
        }
        // If user exits but signed up yet on the system
        if (isUser && !isUser?.alias && !isUser?.name && !isUser?.dateOfBirth && !isUser?.gender && !isUser?.email) {
            return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?signup=true&apple_id=${isUser.appleId}`);
        }
        const token = jsonwebtoken_1.default.sign({ userId: isUser.hmacKey }, process.env.JWT_SECRET, { expiresIn: '7d' });
        const session = new session_1.default({
            token,
            user: isUser?._id
        });
        await session.save();
        res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?token=${token}`);
    })(req, res, next);
};
exports.appleAuthCallback = appleAuthCallback;
const completeSignUp = async (req, res) => {
    const data = req.body;
    if (!data?.email)
        return res.status(400).json({ message: 'Email is required', error: true, code: 'WARNING' });
    if (!data?.alias)
        return res.status(400).json({ message: 'Alias is required', error: true, code: 'WARNING' });
    if (!data?.name)
        return res.status(400).json({ message: 'Name is required', error: true, code: 'WARNING' });
    if (!data?.gender)
        return res.status(400).json({ message: 'Gender is required', error: true, code: 'WARNING' });
    if (!data?.dateOfBirth)
        return res.status(400).json({ message: 'Date of birth is required', error: true, code: 'WARNING' });
    try {
        if (data?.appleId?.trim() === '') {
            const isUser = await user_1.default.findOne({ email: data?.email });
            if (!isUser)
                return res
                    .status(404)
                    .json({ message: 'No user found with email address. Please login', error: true, code: 'NO_USER_FOUND' });
            // If exist update the user details
            const user = await user_1.default.findByIdAndUpdate(isUser?._id, {
                alias: data?.alias,
                name: data?.name,
                dateOfBirth: data?.dateOfBirth,
                gender: data?.gender,
                elo: {
                    rating: 1500,
                    tau: 0.5,
                    rd: 200,
                    vol: 0.06
                }
            });
            if (data?.club) {
                await favorite_1.default.create({ user: user?._id, club: data?.club });
            }
            const token = jsonwebtoken_1.default.sign({ userId: isUser.hmacKey }, process.env.JWT_SECRET, { expiresIn: '7d' });
            const session = new session_1.default({
                token,
                user: isUser?._id
            });
            await session.save();
            res.status(200).json({ message: 'Sign up completed', code: 'SIGNUP_SUCCESSFUL', error: false, token });
        }
        else {
            const isUser = await user_1.default.findOne({ appleId: data?.appleId });
            if (!isUser)
                return res
                    .status(404)
                    .json({ message: 'No user found with email address. Please login', error: true, code: 'NO_USER_FOUND' });
            // If exist update the user details
            const user = await user_1.default.findByIdAndUpdate(isUser?._id, {
                email: data?.email,
                alias: data?.alias,
                name: data?.name,
                dateOfBirth: data?.dateOfBirth,
                gender: data?.gender,
                elo: {
                    rating: 1500,
                    tau: 0.5,
                    rd: 200,
                    vol: 0.06
                }
            });
            if (data?.club) {
                await favorite_1.default.create({ user: user?._id, club: data?.club });
            }
            const token = jsonwebtoken_1.default.sign({ userId: isUser.hmacKey }, process.env.JWT_SECRET, { expiresIn: '7d' });
            const session = new session_1.default({
                token,
                user: isUser?._id
            });
            await session.save();
            res.status(200).json({ message: 'Sign up completed', code: 'SIGNUP_SUCCESSFUL', error: false, token });
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }
    catch (error) {
        (0, logs_1.LogError)(__dirname, 'POST', req.originalUrl, error);
        res.status(500).json({ message: error.message, code: 'SIGN_UP_FAILED', error: true });
    }
};
exports.completeSignUp = completeSignUp;
//# sourceMappingURL=auth.controller.js.map