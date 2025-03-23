import {beforeAll, describe} from "vitest";
import {Workflow} from "../../src/domain/feature/workflow/workflow.feature";
import {ConnectionManager} from "../../src/domain/feature/connection/connection-manager.port";
import {Logger} from "../../src/domain/logger.port";
import {NmcliConnectionManager} from "../../src/infrastructure/connection/nmcli-connection-manager.impl";
import {ConnectionType} from "../../src/domain/feature/workflow/workflow.state.model";
import {it,expect, vi} from "vitest";
import {NestPinoLogger} from "../../src/system/logger/nest-pino.logger";
import {PinoLogger} from "nestjs-pino";
import {pinoParams} from "../../src/infrastructure/logger/pino.params";
import {ConnectionState} from "../../src/domain/feature/connection/connection.type";
import {FakeConnectionManager} from "./fake-connection-manager.impl";

describe('Workflow', () => {
    let workflow: Workflow;
    let connectionManager: FakeConnectionManager;
    let logger: Logger;

    beforeAll(() => {
        const pinoLogger = new PinoLogger(pinoParams);
        logger = new NestPinoLogger(pinoLogger)
        connectionManager = new FakeConnectionManager(logger);
        workflow = new Workflow(connectionManager, logger);
    });

    describe(`When Connection State is ${ConnectionState.NONE}`, () => {
        it('Should set primary connection to higher priority if up', async () => {
            const primary = ConnectionType.PRIMARY;
            const backup = ConnectionType.BACKUP;

            const setHigherPriorityToSpy = vi.spyOn(connectionManager, 'setHigherPriorityTo');
            const setLowerPriorityToSpy = vi.spyOn(connectionManager, 'setLowerPriorityTo');

            connectionManager.connectionIsHealthy = true;

            await workflow.handler(ConnectionType.PRIMARY, ConnectionType.BACKUP);

            expect(setHigherPriorityToSpy).toHaveBeenCalledWith(primary);
            expect(setLowerPriorityToSpy).toHaveBeenCalledWith(backup);
        });
    })
})