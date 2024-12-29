import { Ipv4Address, Ipv4Prefix } from "./addressing.js";

export class RoutingTable {
    /**
     * I'd also like to implement load balancing in some way.
     * E.g. the get(...) function could return an array of routes instead
     *      The "best" (lowest AD) routes would be included in this array
     */
    private _table: Map<string, Map<number, [Ipv4Address, Ipv4Address][]>> = new Map();
                        // network address --> AD --> [remote_gateway, local_inf]

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
        const key: string = dest_ipv4.and(dest_prefix).toString();
        const new_route: [Ipv4Address, Ipv4Address] = [remote_gateway, local_inf];
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
        for (let i=32; i >= 0; i++) {
            const try_search = this._table.get(dest_ipv4.and(new Ipv4Prefix(i)).toString());
            if (try_search !== undefined) {
                const routes = try_search.get(Math.min(...try_search.keys()));
                // put the top route at the bottom of the array (for load balancing)
                routes.push(routes.splice(0,1)[0]);
                return routes;
            }
        }
        return undefined;
    }
}