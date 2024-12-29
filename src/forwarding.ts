import { MacAddress } from "./addressing.js";

export class ForwardingInformationBase {
    private _table: Map<string, MacAddress> = new Map();
    
    public set(destination: MacAddress, egress: MacAddress) {
        if (egress.compare(destination) != 0) {
            this._table.set(destination.toString(), egress);
        }
    }
    public delete(destination: MacAddress): boolean {
        return this._table.delete(destination.toString());
    }
    public get(destination: MacAddress): MacAddress {
        return this._table.get(destination.toString());
    }
    public has(destination: MacAddress): boolean {
        console.log(`** ${destination} is in my forwarding table`)
        return this._table.has(destination.toString());
    }

    public find(egress: MacAddress): MacAddress[] {
        let macs: MacAddress[] = [];
        for (let entry of this._table.entries()) {
            if (entry[0] === egress.toString()) {
                macs.push(entry[1]);
            }
        }
        return macs;
    }

    public clearValue(egress: MacAddress): number {
        let toClear: string[] = [];
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