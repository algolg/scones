import { MacAddress } from "../addressing.js";

class Cable {
    start_x: number;
    start_y: number;
    end_x: number;
    end_y: number;

    start_inf: MacAddress;
    end_inf: MacAddress;

    public isOn(x: number, y: number): boolean {
        return (y - this.start_y)/(x - this.start_x) - (this.end_y - this.start_y)/(this.end_x-this.start_x) <= 0.1;
    }
}