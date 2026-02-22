"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const crypto_1 = __importDefault(require("crypto"));
const userSchema = new mongoose_1.default.Schema({
    googleId: {
        type: String,
        default: null
    },
    appleId: {
        type: String,
        default: null
    },
    alias: {
        type: String,
        default: null,
        unique: true
    },
    name: {
        type: String,
        default: null
    },
    email: {
        type: String,
        unique: true,
        validate: {
            validator: function (value) {
                return /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/.test(value);
            },
            message: 'Invalid email format'
        }
    },
    dateOfBirth: {
        type: Date,
        default: null // You can set a default value or leave it optional
    },
    gender: {
        type: String,
        enum: {
            values: ['male', 'female', 'other'],
            message: '{VALUE} is not supported'
        },
        default: null
    },
    userType: {
        type: String,
        enum: {
            values: ['user', 'admin'],
            message: '{VALUE} is not supported'
        },
        required: true,
        default: 'user'
    },
    hmacKey: {
        type: String,
        default: function () {
            return crypto_1.default.randomBytes(32).toString('hex');
        }
    },
    elo: {
        rating: {
            type: Number,
            default: 1500,
            required: true
        },
        tau: {
            type: Number,
            default: 0.5,
            required: true
        },
        rd: {
            type: Number,
            default: 200,
            required: true
        },
        vol: {
            type: Number,
            default: 0.06,
            required: true
        }
    }
}, {
    timestamps: true // Automatically adds createdAt and updatedAt fields
});
// Virtual for clubs
userSchema.virtual('clubs', {
    ref: 'Club',
    localField: '_id',
    foreignField: 'user'
});
// Virtual for favorites
userSchema.virtual('favorites', {
    ref: 'Favorite',
    localField: '_id',
    foreignField: 'user'
});
const User = mongoose_1.default.models.User || mongoose_1.default.model('User', userSchema);
exports.default = User;
//# sourceMappingURL=user.js.map