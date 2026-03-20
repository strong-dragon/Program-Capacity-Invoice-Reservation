export default () => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';

  // Validate required secrets in production
  if (isProduction) {
    const missingVars: string[] = [];

    if (!process.env.JWT_SECRET) {
      missingVars.push('JWT_SECRET');
    }
    if (!process.env.DB_PASSWORD) {
      missingVars.push('DB_PASSWORD');
    }

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables in production: ${missingVars.join(', ')}`,
      );
    }
  }

  return {
    nodeEnv,
    port: parseInt(process.env.PORT ?? '3000', 10),
    database: {
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USERNAME ?? 'capacity',
      password: process.env.DB_PASSWORD ?? 'capacity_secret',
      database: process.env.DB_DATABASE ?? 'capacity_db',
    },
    jwt: {
      secret: process.env.JWT_SECRET ?? 'dev-secret-do-not-use-in-production',
      expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
    },
    kafka: {
      brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
      groupId: process.env.KAFKA_GROUP_ID ?? 'capacity-service',
    },
  };
};
