"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForwardingInformationBase = void 0;
class ForwardingInformationBase {
    constructor() {
        this._table = new Map();
    }
    set(destination, egress) {
        console.log(`** ${egress}: adding ${destination} to my forwarding table`);
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
}
exports.ForwardingInformationBase = ForwardingInformationBase;
//# sourceMappingURL=forwarding.js.map