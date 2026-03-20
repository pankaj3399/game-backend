import express from 'express';
import { createRouteHandler } from 'uploadthing/express';
import { uploadRouter } from '../lib/uploadthing';
import authenticate from '../middlewares/auth';
import { requireClubAdminOrAbove } from '../middlewares/rbac';

const router = express.Router();

const normalizedUploadthingIsDev = process.env.UPLOADTHING_IS_DEV?.trim().toLowerCase();
const isUploadthingDev = normalizedUploadthingIsDev
	? normalizedUploadthingIsDev === 'true'
	: process.env.NODE_ENV !== 'production';

const uploadthingCallbackUrl =
	process.env.UPLOADTHING_CALLBACK_URL?.trim() ||
	(isUploadthingDev ? `http://localhost:${process.env.PORT || 4000}/api/uploadthing` : undefined);

router.use((req, res, next) => {
	const uploadthingHookHeader = req.headers['uploadthing-hook'];
	const uploadthingHook = Array.isArray(uploadthingHookHeader)
		? uploadthingHookHeader[0]
		: uploadthingHookHeader;

	if (uploadthingHook === 'callback' || uploadthingHook === 'error') {
		next();
		return;
	}

	authenticate(req, res, () => {
		requireClubAdminOrAbove(req, res, next);
	});
});

router.use(
	'/',
	createRouteHandler({
		router: uploadRouter,
		config: {
			isDev: isUploadthingDev,
			callbackUrl: uploadthingCallbackUrl,
		},
	})
);

export default router;