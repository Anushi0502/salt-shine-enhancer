import { getReactDomRuntime } from "./react-runtime";

const ReactDOM = getReactDomRuntime();

export const createRoot = ReactDOM.createRoot.bind(ReactDOM);
export const hydrateRoot = ReactDOM.hydrateRoot?.bind(ReactDOM);

export default {
  createRoot,
  hydrateRoot,
};
