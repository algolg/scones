import { MacAddress } from "./addressing";

export class ForwardingInformationBase {
    private _table: Map<MacAddress, MacAddress> = new Map();
    
    public set(destination: MacAddress, egress: MacAddress) {
        this._table.set(destination, egress);
    }
    public delete(destination: MacAddress): boolean {
        return this._table.delete(destination);
    }
    public get(destination: MacAddress): Readonly<MacAddress> {
        return this._table.get(destination);
    }
    public has(destination: MacAddress): boolean {
        return this._table.has(destination)
    }

    public find(egress: MacAddress): Readonly<MacAddress>[] {
        let macs: MacAddress[] = [];
        for (let entry of this._table.entries()) {
            if (entry[0].compare(egress) == 1) {
                macs.push(entry[1]);
            }
        }
        return macs;
    }
}