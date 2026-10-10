/**
 * Stands in for Node's own modules in the browser build. MuPDF imports them
 * only when it finds itself running in Node, so nothing here is ever called.
 */
export const createRequire = () => () => ({})
const nothing = {}
export default nothing
