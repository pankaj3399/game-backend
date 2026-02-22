"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const SessionSchema = new mongoose_1.default.Schema({
    token: {
        type: String,
        required: true
    },
    user: {
        type: mongoose_1.default.Types.ObjectId,
        ref: 'User',
        required: true
    },
    expireAt: { type: Date, default: Date.now, expires: 604800 } // 604800 seconds = 7 days
});
const Session = mongoose_1.default.models.Session || mongoose_1.default.model('Session', SessionSchema);
exports.default = Session;
//# sourceMappingURL=session.js.map