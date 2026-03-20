import { createUploadthing, type FileRouter } from 'uploadthing/express';

const f = createUploadthing();

export const uploadRouter = {
	sponsorLogoUploader: f({
		image: {
			maxFileSize: '16MB',
			maxFileCount: 1,
		},
		pdf: {
			maxFileSize: '16MB',
			maxFileCount: 1,
		}
	})
		.middleware(async ({ req }) => {
			const user = req.user;

			if (!user) {
				throw new Error('Unauthorized');
			}

			return {
				userId: user._id.toString(),
				role: user.role,
			};
		})
		.onUploadComplete(async () => {
			return;
		}),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;