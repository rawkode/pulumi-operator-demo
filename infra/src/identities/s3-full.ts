import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as kubernetes from "@pulumi/kubernetes";

export const becomeS3Full = (
  provider: kubernetes.Provider,
  clusterOidcProvider: aws.iam.OpenIdConnectProvider
): kubernetes.core.v1.ServiceAccount => {
  const saName = "s3";
  const saAssumeRolePolicy = pulumi
    .all([clusterOidcProvider.url, clusterOidcProvider.arn])
    .apply(([url, arn]) =>
      aws.iam.getPolicyDocument({
        statements: [
          {
            actions: ["sts:AssumeRoleWithWebIdentity"],
            conditions: [
              {
                test: "StringEquals",
                values: [`system:serviceaccount:default:${saName}`],
                variable: `${url.replace("https://", "")}:sub`,
              },
            ],
            effect: "Allow",
            principals: [{ identifiers: [arn], type: "Federated" }],
          },
        ],
      })
    );

  const saRole = new aws.iam.Role(saName, {
    assumeRolePolicy: saAssumeRolePolicy.json,
  });

  const saS3Rpa = new aws.iam.RolePolicyAttachment(saName, {
    policyArn: "arn:aws:iam::aws:policy/AmazonS3FullAccess",
    role: saRole,
  });

  return new kubernetes.core.v1.ServiceAccount(
    saName,
    {
      metadata: {
        namespace: "default",
        name: saName,
        annotations: {
          "eks.amazonaws.com/role-arn": saRole.arn,
        },
      },
    },
    { provider }
  );
};
