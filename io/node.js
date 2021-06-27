"use strict";
///<reference types="node" />
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBuffer = void 0;
const promises_1 = require("fs/promises");
async function getBuffer(path) {
    return await promises_1.readFile(path);
}
exports.getBuffer = getBuffer;
