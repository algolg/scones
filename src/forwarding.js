"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForwardingInformationBase = void 0;
class ForwardingInformationBase {
    constructor() {
        this._table = new Map();
    }
    set(destination, egress) {
        this._table.set(destination, egress);
    }
    delete(destination) {
        return this._table.delete(destination);
    }
    get(destination) {
        return this._table.get(destination);
    }
    has(destination) {
        return this._table.has(destination);
    }
    find(egress) {
        let macs = [];
        for (let entry of this._table.entries()) {
            if (entry[0].compare(egress) == 1) {
                macs.push(entry[1]);
            }
        }
        return macs;
    }
}
exports.ForwardingInformationBase = ForwardingInformationBase;
//# sourceMappingURL=forwarding.js.map