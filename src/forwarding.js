"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForwardingInformationBase = void 0;
class ForwardingInformationBase {
    constructor() {
        this._table = new Map();
    }
    set(destination, egress) {
        if (egress.compare(destination) != 0) {
            this._table.set(destination.toString(), egress);
        }
    }
    delete(destination) {
        return this._table.delete(destination.toString());
    }
    get(destination) {
        return this._table.get(destination.toString());
    }
    has(destination) {
        console.log(`** ${destination} is in my forwarding table`);
        return this._table.has(destination.toString());
    }
    find(egress) {
        let macs = [];
        for (let entry of this._table.entries()) {
            if (entry[0] === egress.toString()) {
                macs.push(entry[1]);
            }
        }
        return macs;
    }
    clearValue(egress) {
        let toClear = [];
        for (let [key, value] of this._table.entries()) {
            if (value.compare(egress) == 0) {
                toClear.push(key);
            }
        }
        for (let destination of toClear) {
            this._table.delete(destination);
        }
        return toClear.length;
    }
}
exports.ForwardingInformationBase = ForwardingInformationBase;
//# sourceMappingURL=forwarding.js.map