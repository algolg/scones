import { Ipv4Address, Ipv4Prefix, MacAddress } from "./addressing.js";
import { L3Interface } from "./interface.js";

export class RoutingTable {
    private _loopback: Ipv4Address;
    private _local_infs: [Ipv4Address, Ipv4Prefix][] = [];
    private _table: Map<string, Map<number, [Ipv4Address, Ipv4Address][]>> = new Map();
                        // network address --> AD --> [remote_gateway, local_inf]

    public setLocalInfs(loopback: Ipv4Address, ...l3infs: L3Interface[]) {
        this._loopback = loopback;
        this._local_infs.push([loopback, new Ipv4Prefix(32)]);
        l3infs.forEach((l3inf) => this._local_infs.push([l3inf.ipv4, l3inf.ipv4_prefix]));
    }
    /**
     * Adds a route to the routing table. Note that remote_gateway and local_inf must refer to the same path.
     * @param dest_ipv4 The destination network of the route
     * @param dest_prefix The destination CIDR prefix of the route
     * @param remote_gateway The next-hop gateway for the route (must be reachable through local_inf)
     * @param local_inf The interface out of which packets exit (must provide point towards remote_gateway)
     * @param administrative_distance The administrative distance (preference) of the route. A lower value indicates higher preference.
     * @returns 
     */
    public set(dest_ipv4: Ipv4Address, dest_prefix: Ipv4Prefix, remote_gateway: Ipv4Address, local_inf: Ipv4Address, administrative_distance: number): boolean {
        const key: string = `${dest_ipv4.and(dest_prefix)}/${dest_prefix.value}`;
        const new_route: [Ipv4Address, Ipv4Address] = [remote_gateway, local_inf];
        administrative_distance = Math.max(1, administrative_distance); // only directly connected routes will have AD of 0
        // if the destination already has route(s), add the route only if it is new
        if (this._table.has(key)) {
            const routes = this._table.get(key).get(administrative_distance);
            for (let route of routes) {
                if (route[0] == new_route[0] && route[1] == new_route[1]) {
                    return false;
                }
            }
            routes.push(new_route);
        }
        // otherwise, add the route
        else {
            this._table.set(
                key,
                new Map<number, [Ipv4Address, Ipv4Address][]>()
                .set(administrative_distance, [[remote_gateway, local_inf]])
            );
        }
        return true;
    }

    /**
     * Gets an array of the lowest-cost routes to a destination IPv4 address
     * @param dest_ipv4 the destination IPv4 address of the route
     * @returns an array of (remote gateway, local interface) IPv4 address pairs
     */
    public get(dest_ipv4: Ipv4Address): [Ipv4Address, Ipv4Address][] {
        // if the device itself has the destination interface, return [[dest_ipv4, loopback(?)]]
        // if the device is on the subnet of the dest ipv4, return [dest_ipv4, local inf][]
        for (let pairs of this._local_infs) {
            if (pairs === undefined) {
                continue;
            }
            if (dest_ipv4.compare(pairs[0]) == 0) {
                return [[dest_ipv4, this._loopback]];
            }
            if (dest_ipv4.and(pairs[1]).compare(pairs[0].and(pairs[1])) == 0) {
                return [[dest_ipv4, pairs[0]]];
            }
        }
        for (let i=32; i >= 0; i--) {
            const try_search = this._table.get(`${dest_ipv4.and(new Ipv4Prefix(i))}/${i}`);
            if (try_search !== undefined) {
                const routes = try_search.get(Math.min(...try_search.keys()));
                // put the top route at the bottom of the array (for load balancing)
                routes.push(routes.splice(0,1)[0]);
                return routes;
            }
        }
        return undefined;
    }

    public delete(dest_ipv4: Ipv4Address, dest_prefix: Ipv4Prefix, remote_gateway: Ipv4Address, local_inf: Ipv4Address, administrative_distance: number): boolean {
        const key: string = `${dest_ipv4.and(dest_prefix)}/${dest_prefix.value}`;
        const find_route: [Ipv4Address, Ipv4Address] = [remote_gateway, local_inf];
        if (this._table.has(key)) {
            const ADs = this._table.get(key);
            if (ADs.has(administrative_distance)) {
                let routes = ADs.get(administrative_distance);
                const route_idx = routes.findIndex((val) =>
                    val[0].compare(find_route[0]) == 0 &&
                    val[1].compare(find_route[1]) == 0
                );
                if (route_idx != -1) {
                    // Delete the route
                    routes.splice(route_idx, 1);
                    // Delete unneeded route info
                    if (routes.length == 0) {
                        ADs.delete(administrative_distance);
                        if (ADs.size == 0) {
                            this._table.delete(key);
                        }
                    }
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Gets all non-local routes on the device
     * @returns An array of [Destination Network, Next-Hop IPv4, Exit Interface IPv4, Administrative Distance] tuples defining every route
     */
    public getAllRoutes(): [string, Ipv4Address, Ipv4Address, number][] {
        let output: [string, Ipv4Address, Ipv4Address, number][] = [];
        for (let dest of this._table.entries()) {
            for (let AD of dest[1]) {
                for (let route_info of AD[1]) {
                    output.push([dest[0], route_info[0], route_info[1], AD[0]]);
                }
            }
        }
        return output;
    }
}