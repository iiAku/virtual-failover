import {beforeAll, describe, it, expect} from "vitest";
import {NmcliConnectionManager} from "../../src/infrastructure/connection/nmcli-connection-manager.impl";
import {ConnectionType} from "../../src/domain/feature/workflow/workflow.state.model";
import {AppModule} from "../../src/app.module";
import { Test } from '@nestjs/testing';
import {ConnectionManager} from "../../src/domain/feature/connection/connection-manager.port";

describe('Connection Manager', () => {
    let connectionManager: ConnectionManager;

    beforeAll(async() => {
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        connectionManager = moduleRef.get(ConnectionManager);
    })

    it.each([ConnectionType.PRIMARY, ConnectionType.BACKUP])('Should be able to test the connectivity using curl of a given link against a random url %s', async (testedConnection) => {
        const result = await connectionManager.isConnectionHealthy(testedConnection);


        expect(result).toBeDefined();
        expect(result.healthy).toBe(true);
        expect(result.connectionType).toBe(testedConnection);
        expect(result.checkResolvedInMilisseconds).toBeGreaterThan(0)
    })

    it.each([ConnectionType.PRIMARY, ConnectionType.BACKUP])('Should reconnect to the given connection: %s', async (testedConnection) => {
        const result = await connectionManager.reconnect(testedConnection);

        expect(result).toBeUndefined();
    });
})