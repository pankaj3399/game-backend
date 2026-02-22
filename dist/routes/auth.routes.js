"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_controller_1 = require("../controllers/auth.controller");
const router = express_1.default.Router();
router.get('/google', auth_controller_1.googleAuth);
router.get('/google/callback', auth_controller_1.googleAuthCallback);
router.get('/apple', auth_controller_1.appleAuth);
router.get('/apple/callback', auth_controller_1.appleAuthCallback);
router.post('/complete-signup', auth_controller_1.completeSignUp);
exports.default = router;
//# sourceMappingURL=auth.routes.js.map