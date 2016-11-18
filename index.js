const jwt = require('jsonwebtoken');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

console.log('Loading jwtAuthorizer');

exports.handler = function(event, context) {
  console.log('Received event', JSON.stringify(event, null, 2));

  // remove the 'Bearer ' prefix from the auth token
  const token = event.authorizationToken.replace(/Bearer /g, '');

  // parse all API options from the event, we need some of them
  const apiOptions = getApiOptions(event);

  // s3 info where to find the config and key files
  // they should have the stage name in filepath to determine the correct context values
  const bucketName = 'jwtsso';
  const filePathConfig = 'jwtConfig_' + apiOptions.stageName + '.json';
  const filePathPublicKey = 'jwtPublicKey_' + apiOptions.stageName + '.txt';
  // first, get the config file and content
  s3.getObject({Bucket: bucketName, Key: filePathConfig}, (err, configData) => {
    if (err) {
      console.log('S3 CONFIG ERROR', err, err.stack);
      context.succeed(denyPolicy('anonymous', event.methodArn));
    } else {
      const config = configData.Body.toString();
      // now, get the public key/cert file and content
      s3.getObject({Bucket: bucketName, Key: filePathPublicKey}, (e, publicKeyData) => {
        if (e) {
          console.log('S3 PUBLICKEY ERROR', e, e.stack);
          context.succeed(denyPolicy('anonymous', event.methodArn));
        } else {
          const publicKey = publicKeyData.Body.toString();

          // verify the token with loaded publicKey and config and return proper AWS policy document
          try {
            const verified = jwt.verify(token, publicKey, config);
            context.succeed(allowPolicy(verified.sub, event.methodArn));
          } catch(e) {
            console.log('JWT Error', e, e.stack);
            context.succeed(denyPolicy('anonymous', event.methodArn));
          }
        }
      })
    }
  });

};

const getApiOptions = function(event) {
  const apiOptions = {};
  const tmp = event.methodArn.split(':');
  const apiGatewayArnTmp = tmp[5].split('/');
  apiOptions.awsAccountId = tmp[4];
  apiOptions.region = tmp[3];
  apiOptions.restApiId = apiGatewayArnTmp[0];
  apiOptions.stageName = apiGatewayArnTmp[1];
  return apiOptions;
};

const denyPolicy = function(principalId, resource) {
  return generatePolicy(principalId, 'Deny', resource);
};

const allowPolicy = function(principalId, resource) {
  return generatePolicy(principalId, 'Allow', resource);
};

const generatePolicy = function(principalId, effect, resource) {
    const authResponse = {};
    authResponse.principalId = principalId;
    if (effect && resource) {
        const policyDocument = {};
        policyDocument.Version = '2012-10-17'; // default version
        policyDocument.Statement = [];
        const statementOne = {};
        statementOne.Action = 'execute-api:Invoke'; // default action
        statementOne.Effect = effect;
        statementOne.Resource = resource;
        policyDocument.Statement[0] = statementOne;
        authResponse.policyDocument = policyDocument;
    }
    return authResponse;
};
