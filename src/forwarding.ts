import { MacAddress } from "./addressing";

export class ForwardingInformationBase {
    private _table: Map<string, MacAddress> = new Map();
    
    public set(destination: MacAddress, egress: MacAddress) {
        console.log(`** ${egress}: adding ${destination} to my forwarding table`)
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
}