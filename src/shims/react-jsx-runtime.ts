import { getReactRuntime } from "./react-runtime";

const React = getReactRuntime();

function withKey(props: Record<string, unknown> | null | undefined, key: unknown) {
  if (key === undefined) {
    return props ?? {};
  }

  return {
    ...(props ?? {}),
    key,
  };
}

function createJsxElement(
  type: any,
  props: Record<string, unknown> | null | undefined,
  key: unknown,
) {
  return React.createElement(type, withKey(props, key));
}

export const Fragment = React.Fragment;
export const jsx = createJsxElement;
export const jsxs = createJsxElement;
export const jsxDEV = createJsxElement;

export default {
  Fragment,
  jsx,
  jsxs,
  jsxDEV,
};
