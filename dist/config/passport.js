"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
const passport_1 = __importDefault(require("passport"));
const passport_google_oauth20_1 = require("passport-google-oauth20");
const user_1 = __importDefault(require("../models/user"));
const passport_apple_1 = require("passport-apple");
// Google OAuth Strategy
passport_1.default.use(new passport_google_oauth20_1.Strategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL //'/api/auth/google/callback'
}, 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async (accessToken, refreshToken, profile, done) => {
    // Use Function type for `done`
    try {
        const { id, emails } = profile;
        const email = emails && emails[0]?.value;
        if (!email) {
            return done(new Error('No email found in Google profile'), undefined);
        }
        const isUser = await user_1.default.findOne({ googleId: id });
        // If user exist just return the user after verifying it
        if (isUser) {
            return done(null, isUser);
        }
        const newUser = new user_1.default({
            googleId: id,
            email: email
        });
        await newUser.save();
        done(null, newUser);
    }
    catch (error) {
        done(error); // Ensure `error` is cast to `Error`
    }
}));
passport_1.default.use(new passport_apple_1.Strategy({
    clientID: process.env.APPLE_CLIENT_ID,
    teamID: process.env.APPLE_TEAM_ID,
    keyID: process.env.APPLE_KEY_ID,
    privateKey: process.env.APPLE_PRIVATE_KEY,
    callbackURL: '/api/auth/apple/callback'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
}, 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async (accessToken, refreshToken, idToken, profile, done) => {
    try {
        const isUser = await user_1.default.findOne({ appleId: profile.id });
        if (isUser) {
            return done(null, isUser);
        }
        console.log(profile);
        const newUser = new user_1.default({
            appleId: profile.id,
            name: `${profile.name?.firstName} ${profile.name?.lastName}`
        });
        await newUser.save();
        done(null, newUser);
    }
    catch (error) {
        done(error); // Ensure `error` is cast to `Error`
    }
}));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
passport_1.default.serializeUser((user, done) => {
    done(null, user.id);
});
passport_1.default.deserializeUser(async (id, done) => {
    try {
        const userInfo = await user_1.default.findById(id);
        done(null, userInfo);
    }
    catch (error) {
        done(error, undefined); // Ensure `error` is cast to `Error`
    }
});
//# sourceMappingURL=passport.js.map