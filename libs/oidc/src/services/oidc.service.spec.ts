import { OidcService } from './oidc.service';
import {
  MOCK_OIDC_MODULE_OPTIONS,
  MOCK_ISSUER_INSTANCE,
  MOCK_CLIENT_INSTANCE,
  MOCK_TRUST_ISSUER,
} from '../mocks';
import { OidcModuleOptions, ChannelType } from '../interfaces';
import { Issuer } from 'openid-client';
import { createRequest, createResponse } from 'node-mocks-http';
import { OidcStrategy } from '../strategies';
import passport = require('passport');
import axios from 'axios';

describe('OidcService', () => {
  let service = new OidcService(MOCK_OIDC_MODULE_OPTIONS);
  let options: OidcModuleOptions = MOCK_OIDC_MODULE_OPTIONS;

  describe('createStrategy', () => {
    beforeEach(async () => {
      const IssuerMock = MOCK_ISSUER_INSTANCE;
      IssuerMock.keystore = jest.fn();
      jest
        .spyOn(Issuer, 'discover')
        .mockImplementation(() => Promise.resolve(IssuerMock));
    });
    it('should create strategy when app is single tenant', async () => {
      let strategy = await service.createStrategy();
      expect(strategy).toBeDefined();
    });

    it('should create strategy when app is single tenant with nonce = true', async () => {
      service.options.authParams.nonce = 'true';
      let strategy = await service.createStrategy();
      expect(strategy).toBeDefined();
    });

    it('should create strategy when app is single tenant without defaultHttpOptions', async () => {
      delete service.options.defaultHttpOptions;
      let strategy = await service.createStrategy();
      expect(strategy).toBeDefined();
    });

    it('should create strategy with b2c channel when app is multitenant', async () => {
      delete service.options.issuer;
      service.options.issuerOrigin = 'http://issuer.io';
      service.options['b2c'] = {
        clientMetadata: MOCK_OIDC_MODULE_OPTIONS.clientMetadata,
      };

      let strategy = await service.createStrategy('tenant', ChannelType.b2c);
      expect(strategy).toBeDefined();
    });

    it('should create strategy with b2e channel when app is multitenant', async () => {
      delete service.options.issuer;
      service.options.issuerOrigin = 'http://issuer.io';
      service.options['b2e'] = {
        clientMetadata: MOCK_OIDC_MODULE_OPTIONS.clientMetadata,
      };
      let strategy = await service.createStrategy('tenant', ChannelType.b2e);
      expect(strategy).toBeDefined();
    });

    it('should terminate process on error fetching issuer for single tenant app', async () => {
      const IssuerMock = MOCK_ISSUER_INSTANCE;
      IssuerMock.keystore = jest.fn();
      jest.spyOn(Issuer, 'discover').mockImplementation(() => Promise.reject());

      let mockExit = jest
        .spyOn(process, 'exit')
        .mockImplementation((code?: number): never => {
          return undefined as never;
        });
      service.isMultitenant = false;
      await service.createStrategy('tenant', ChannelType.b2c);
      expect(mockExit).toHaveBeenCalled();
    });

    it('should throw on error fetching issuer for multitenant app', async () => {
      const IssuerMock = MOCK_ISSUER_INSTANCE;
      IssuerMock.keystore = jest.fn();
      jest.spyOn(Issuer, 'discover').mockImplementation(() => Promise.reject());
      service.isMultitenant = true;
      await expect(
        service.createStrategy('tenant', ChannelType.b2c),
      ).rejects.toThrow();
    });
  });

  describe('onModuleInit', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });
    it('should do nothing when app is multitenant', async () => {
      const createStrategySpy = jest
        .spyOn(service, 'createStrategy')
        .mockReturnValue(Promise.resolve({}));
      service.isMultitenant = true;
      service.onModuleInit();
      expect(createStrategySpy).toHaveBeenCalledTimes(0);
    });

    it('should call createStrategy when app is single tenant', async () => {
      const spy = jest
        .spyOn(service, 'createStrategy')
        .mockReturnValue(Promise.resolve({}));
      service.isMultitenant = false;
      service.onModuleInit();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('isExpired', () => {
    it('should return false if no expiredAt token', () => {
      expect(service.isExpired(null)).toBeFalsy();
    });

    it('should return true if expiresAt time is reach', () => {
      jest.spyOn(Date, 'now').mockReturnValue(1598537591300000);
      expect(service.isExpired(1598537521300)).toBeTruthy();
    });

    it('should return false if expiresAt time is not reach', () => {
      jest.spyOn(Date, 'now').mockReturnValue(1598537521300000);
      expect(service.isExpired(1598537591300)).toBeFalsy();
    });
  });

  describe('login', () => {
    let res, req, next, params;
    beforeEach(() => {
      req = createRequest();
      res = createResponse();
      next = jest.fn();
      params = {};
      service.client = MOCK_CLIENT_INSTANCE;
      service.options = MOCK_OIDC_MODULE_OPTIONS;
    });

    it('should call passport authenticate for single tenant login', async () => {
      service.strategy = new OidcStrategy(service);
      const spy = jest
        .spyOn(passport, 'authenticate')
        .mockImplementation(() => {
          return (req, res, next) => {};
        });
      await service.login(req, res, next, params);
      expect(spy).toHaveBeenCalled();
    });

    it('should call passport authenticate for multitenant login', async () => {
      service.strategy = null;
      params = {
        tenantId: 'tenant',
        channelType: 'b2c',
      };
      const spy = jest
        .spyOn(passport, 'authenticate')
        .mockImplementation(() => {
          return (req, res, next) => {};
        });
      await service.login(req, res, next, params);
      expect(spy).toHaveBeenCalled();
    });

    it('should send a 404 when error in createStrategy', async () => {
      service.strategy = null;
      params = {
        tenantId: 'tenant',
        channelType: 'b2c',
      };
      jest.spyOn(service, 'createStrategy').mockImplementation(() => {
        throw new Error();
      });
      const spy = jest.spyOn(res, 'status');
      await service.login(req, res, next, params);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    let res, req, params, spyLogout, spyResponse;
    beforeEach(() => {
      req = createRequest();
      res = createResponse();
      params = {};
      service.client = MOCK_CLIENT_INSTANCE;
      service.options = MOCK_OIDC_MODULE_OPTIONS;
      service.trustIssuer = MOCK_TRUST_ISSUER;
      req.logout = jest.fn();
      req.isAuthenticated = jest.fn().mockReturnValue(true);
      spyLogout = jest.spyOn(req, 'logout');
      spyResponse = jest.spyOn(res, 'redirect');
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should send 404 if the user is not authenticated', async () => {
      req.isAuthenticated = jest.fn().mockReturnValue(false);
      await service.logout(req, res, params);
      expect(res.statusCode).toEqual(404);
    });

    it('should call logout', () => {
      (req.session as any) = {
        destroy: cb => {
          cb(null);
        },
      };

      service.logout(req, res, params);
      expect(spyLogout).toHaveBeenCalled();
    });

    it('should redirect without id_token_hint', done => {
      req.user = {};
      (req.session as any) = {
        destroy: jest.fn().mockImplementation(callback => {
          callback().then(() => {
            expect(spyResponse).toHaveBeenCalledWith(
              expect.not.stringContaining('id_token_hint'),
            );
            done();
          });
        }),
      };
      service.logout(req, res, params);
    });

    it('should redirect with id_token_hint', done => {
      req.user = {
        id_token: '123',
      };
      (req.session as any) = {
        destroy: jest.fn().mockImplementation(callback => {
          callback().then(() => {
            expect(spyResponse).toHaveBeenCalledWith(
              expect.stringContaining('id_token_hint'),
            );
            done();
          });
        }),
      };
      service.logout(req, res, params);
    });

    it('should redirect on redirectUriLogout if set', done => {
      req.user = {
        id_token: '123',
      };
      const mockRedirectLogout = 'other-website';
      options.redirectUriLogout = mockRedirectLogout;
      (req.session as any) = {
        destroy: jest.fn().mockImplementation(callback => {
          callback().then(() => {
            expect(spyResponse).toHaveBeenCalledWith(
              expect.stringContaining(mockRedirectLogout),
            );
            done();
          });
        }),
      };
      service.logout(req, res, params);
    });

    it('should redirect on loggedout if no end_session_endpoint found', done => {
      service.trustIssuer.metadata.end_session_endpoint = null;

      (req.session as any) = {
        destroy: jest.fn().mockImplementation(callback => {
          callback().then(() => {
            expect(spyResponse).toHaveBeenCalledWith('/loggedout');
            done();
          });
        }),
      };
      service.logout(req, res, params);
    });

    it('should redirect on prefixed loggedout if no end_session_endpoint found', done => {
      service.trustIssuer.metadata.end_session_endpoint = null;

      params = {
        tenantId: 'tenant',
        channelType: ChannelType.b2c,
      };
      (req.session as any) = {
        destroy: jest.fn().mockImplementation(callback => {
          callback().then(() => {
            expect(spyResponse).toHaveBeenCalledWith(
              `/${params.tenantId}/${params.channelType}/loggedout`,
            );
            done();
          });
        }),
      };
      service.logout(req, res, params);
    });
  });

  describe('loggedOut', () => {
    let res, params;
    beforeEach(() => {
      res = createResponse();
      params = {};
    });
    it('should send loggedout file', () => {
      const res = createResponse();
      res.send = jest.fn();
      const spy = jest.spyOn(res, 'send');
      service.loggedOut(res, params);
      expect(spy).toHaveBeenCalled();
    });

    it('should set prefix before sending loggedout file', () => {
      const res = createResponse();
      res.send = jest.fn();
      const spy = jest.spyOn(res, 'send');
      params = {
        tenantId: 'tenant',
        channelType: ChannelType.b2c,
      };
      service.loggedOut(res, params);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('refreshTokens', () => {
    beforeEach(() => {
      service.options['b2c'] = {
        clientMetadata: {
          client_id: '123',
          client_secret: '456',
        },
      };
      service.options['b2e'] = {
        clientMetadata: {
          client_id: '123',
          client_secret: '456',
        },
      };
      options.defaultHttpOptions = {
        timeout: 0,
      };
    });
    it('should return 200 if no token to refresh', async () => {
      const req = createRequest();
      req.user = {
        authTokens: {},
        userinfo: {},
      };
      req.isAuthenticated = jest.fn().mockReturnValue(true);
      const res = createResponse();
      res.status = (() => {
        return { send: jest.fn() };
      }) as any;
      const next = jest.fn();
      const spy = jest.spyOn(res, 'sendStatus');

      await service.refreshTokens(req, res, next);
      expect(spy).toHaveBeenCalledWith(200);
    });

    it('should return 200 if token is valid', () => {
      const req = createRequest();
      req.user = {
        authTokens: {},
        userinfo: {},
      };
      const res = createResponse();
      res.sendStatus = jest.fn();
      const next = jest.fn();
      const spy = jest.spyOn(res, 'sendStatus');

      service.refreshTokens(req, res, next);
      expect(spy).toHaveBeenCalledWith(200);
    });

    it('should return 200 if token was refreshed', async () => {
      const req = createRequest();
      req.user = {
        authTokens: {
          accessToken: 'abc',
          refreshToken: 'def',
          tokenEndpoint: '/token',
          expiresAt: Date.now() / 1000 - 10,
        },
        userinfo: {},
      };
      const res = createResponse();
      res.sendStatus = jest.fn();
      const next = jest.fn();
      const spy = jest.spyOn(res, 'sendStatus');
      jest.spyOn(axios, 'request').mockReturnValue(
        Promise.resolve({
          status: 200,
          data: {
            expires_in: 300,
          },
        }),
      );

      await service.refreshTokens(req, res, next);
      expect(spy).toHaveBeenCalledWith(200);
    });

    it('should return 200 if token was refreshed for b2c channel', async () => {
      const req = createRequest();
      req.user = {
        authTokens: {
          accessToken: 'abc',
          refreshToken: 'def',
          tokenEndpoint: '/token',
          expiresAt: Date.now() / 1000 - 10,
        },
        userinfo: { channel: 'b2c' },
      };
      const res = createResponse();
      res.sendStatus = jest.fn();
      const next = jest.fn();
      const spy = jest.spyOn(res, 'sendStatus');
      jest.spyOn(axios, 'request').mockReturnValue(
        Promise.resolve({
          status: 200,
          data: {
            expires_in: 300,
          },
        }),
      );

      await service.refreshTokens(req, res, next);
      expect(spy).toHaveBeenCalledWith(200);
    });

    it('should return 200 if token was refreshed for b2e channel', async () => {
      const req = createRequest();
      req.user = {
        authTokens: {
          accessToken: 'abc',
          refreshToken: 'def',
          tokenEndpoint: '/token',
          expiresAt: Date.now() / 1000 - 10,
        },
        userinfo: { channel: 'b2e' },
      };
      const res = createResponse();
      res.sendStatus = jest.fn();
      const next = jest.fn();
      const spy = jest.spyOn(res, 'sendStatus');
      jest.spyOn(axios, 'request').mockReturnValue(
        Promise.resolve({
          status: 200,
          data: {
            expires_in: 300,
          },
        }),
      );

      await service.refreshTokens(req, res, next);
      expect(spy).toHaveBeenCalledWith(200);
    });

    it('should return 200 if valid token was refreshed and result has expires_in', async () => {
      const req = createRequest();
      req.user = {
        authTokens: {
          expiresAt: Date.now() / 1000 - 10,
          accessToken: 'abc',
          refreshToken: 'def',
          tokenEndpoint: '/token',
        },
        userinfo: {},
      };
      const res = createResponse();
      res.sendStatus = jest.fn();
      const next = jest.fn();
      const spy = jest.spyOn(res, 'sendStatus');
      jest.spyOn(axios, 'request').mockReturnValue(
        Promise.resolve({
          status: 200,
          data: {
            expires_in: 300,
          },
        }),
      );

      await service.refreshTokens(req, res, next);
      expect(spy).toHaveBeenCalledWith(200);
    });

    it('should return 200 if valid token was refreshed and result has no expires_at and expires_in', async () => {
      const req = createRequest();
      req.user = {
        authTokens: {
          expiresAt: Date.now() / 1000 - 10,
          accessToken: 'abc',
          refreshToken: 'def',
          tokenEndpoint: '/token',
        },
        userinfo: {},
      };
      const res = createResponse();
      res.sendStatus = jest.fn();
      const next = jest.fn();
      const spy = jest.spyOn(res, 'sendStatus');
      jest.spyOn(axios, 'request').mockReturnValue(
        Promise.resolve({
          status: 200,
          data: {},
        }),
      );

      await service.refreshTokens(req, res, next);
      expect(spy).toHaveBeenCalledWith(200);
    });

    it('should return 401 if token failed to refresh', async () => {
      const req = createRequest();
      req.user = {
        authTokens: {
          accessToken: 'abc',
          refreshToken: 'def',
          tokenEndpoint: '/token',
          expiresAt: Date.now() / 1000 - 10,
        },
        userinfo: {},
      };
      const res = createResponse();
      res.status = (() => {
        return { send: jest.fn() };
      }) as any;
      const next = jest.fn();
      const spy = jest.spyOn(res, 'status');
      jest.spyOn(axios, 'request').mockReturnValue(
        Promise.resolve({
          status: 401,
          data: {},
        }),
      );

      await service.refreshTokens(req, res, next);
      expect(spy).toHaveBeenCalledWith(401);
    });
    it('should throw an error 401 if no token endpoint', async () => {
      const req = createRequest();
      req.user = {
        authTokens: {
          accessToken: 'abc',
          refreshToken: 'def',
          expiresAt: Date.now() / 1000 - 10,
        },
        userinfo: {},
      };
      const res = createResponse();
      res.status = (() => {
        return { send: jest.fn() };
      }) as any;
      const next = jest.fn();
      const spy = jest.spyOn(res, 'status');

      await service.refreshTokens(req, res, next);
      expect(spy).toHaveBeenCalledWith(401);
    });
  });
});