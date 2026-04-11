/// <reference types="vite/client" />

declare const __APP_VERSION__: string

declare module '*.css?inline' {
  const css: string
  export default css
}

declare module '*.css?url' {
  const url: string
  export default url
}
