// Shared types for the MCP tool catalog UI. Lives in lib/ rather than in
// the tRPC router so client components can import the type without
// pulling the router's side-effect imports into the client module graph.

export type ToolParamInfo = {
	type: string;
	required: boolean;
	description: string;
	default?: unknown;
	enum?: string[];
};
