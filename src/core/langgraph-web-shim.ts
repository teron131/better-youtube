export * from "@langchain/langgraph/web";
export { createAgent, createMiddleware, toolStrategy } from "langchain";

// Shim for interrupt which is missing in web entrypoint but used by langchain@1.x
export const interrupt = () => {
	throw new Error("interrupt() is not supported in the browser environment.");
};
