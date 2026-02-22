"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const mongoose_1 = __importDefault(require("mongoose"));
const logs_1 = require("./utils/logs");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const public_routes_1 = __importDefault(require("./routes/public.routes"));
const express_session_1 = __importDefault(require("express-session"));
const passport_1 = __importDefault(require("passport"));
require("./config/passport");
const authenticate_1 = __importDefault(require("./middleware/authenticate"));
const PORT = process.env.PORT || 5001;
const app = (0, express_1.default)();
// Increase the size limit for JSON payloads and URL-encoded payloads
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ limit: '10mb', extended: false }));
app.use((0, express_session_1.default)({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
}));
app.use(passport_1.default.initialize());
app.use(passport_1.default.session());
// Configure CORS
app.use((0, cors_1.default)({ origin: true })); // Allows all origins
// Allow preflight requests
app.options('*', (0, cors_1.default)());
mongoose_1.default
    .connect(process.env.MONGODB_URI)
    .then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 MongoDB Server Ready`);
        console.log(`🚀 app is listening on port ${PORT}`);
    });
    // Home route
    app.get('/', (req, res) => {
        res.send(`Running on port ${PORT}`);
    });
    // Public routes
    app.use(`/api/public`, public_routes_1.default);
    app.use(`/api/auth`, auth_routes_1.default);
    app.use(`/api/user`, authenticate_1.default, user_routes_1.default);
})
    .catch((err) => {
    (0, logs_1.LogError)(__dirname, 'MongoDB_Connection', 'MongoDB_Connection', err);
});
//# sourceMappingURL=server.js.map