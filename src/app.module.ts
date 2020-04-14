import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CatsModule } from './cats/cats.module';
import { OidcModule } from '@uxd-finastra/oidc';

@Module({
  imports: [
    ConfigModule.forRoot({
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),
    OidcModule.registerAsync({
      imports: [ConfigModule.forRoot()],
      useFactory: async (configService: ConfigService) => ({
        issuer: configService.get('OIDC_ISSUER'),
        clientId: configService.get('OIDC_CLIENT_ID'),
        clientSecret: configService.get('OIDC_CLIENT_SECRET'),
        scopes: configService.get('OIDC_SCOPES'),
        redirectUriLogin: configService.get('OIDC_LOGIN_REDIRECT_URI'),
        redirectUriLogout: configService.get('OIDC_LOGOUT_REDIRECT_URI'),
      }),
      inject: [ConfigService],
    }),
    CatsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
