export const LogError = (path: string, method: string, endpoint: string, error: unknown) => {
	console.log(`❌ Path: `, path);
	console.log(`❌ Method: `, method);
	console.log(`❌ Endpoint: `, endpoint);
	console.log(`❌ Error: `, error);
};
export const LogSuccess = (path: string, message: string) => console.log(`✅  [${path}] 👉`, message);
export const LogInfo = (path: string, message: string) => console.log(`▶️  [${path}] 👉`, message);
export const LogWarning = (path: string, message: string) => console.log(`⚠️  [${path}] 👉`, message);
