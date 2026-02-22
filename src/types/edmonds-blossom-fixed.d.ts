declare module 'edmonds-blossom-fixed' {
	const blossom: (edges: [number, number, number][], maxCardinality?: boolean) => number[];

	export default blossom;
}
