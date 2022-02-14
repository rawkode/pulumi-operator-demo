import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";
import * as kx from "@pulumi/kubernetesx";

interface Args {
  provider: kubernetes.Provider;
  serviceAccount?: kubernetes.core.v1.ServiceAccount;
}

interface Project {
  name: pulumi.Input<string>;
  org: pulumi.Input<string>;
  repository: pulumi.Input<string>;
  reference?: pulumi.Input<string>;
  directory?: pulumi.Input<string>;
  accessToken: pulumi.Input<string>;
}

export const allowOnboarding = (args: Args): kubernetes.yaml.ConfigFile => {
  return new kubernetes.yaml.ConfigFile(
    "crds",
    {
      file: "https://raw.githubusercontent.com/pulumi/pulumi-kubernetes-operator/v1.4.0/deploy/crds/pulumi.com_stacks.yaml",
    },
    {
      provider: args.provider,
    }
  );
};

export const onboardTeam = async (
  project: Project,
  args: Args,
  dependsOn:
    | pulumi.Output<kubernetes.yaml.ConfigFile>
    | kubernetes.yaml.ConfigFile
): Promise<void> => {
  const namespace = "default";

  const operatorServiceAccount = new kubernetes.core.v1.ServiceAccount(
    `${project.name}-pulumi-operator-service-account`,
    {
      metadata: {
        namespace,
      },
    },
    {
      provider: args.provider,
    }
  );

  const operatorRole = new kubernetes.rbac.v1.Role(
    `${project.name}-pulumi-operator-role`,
    {
      metadata: {
        namespace,
      },
      rules: [
        {
          apiGroups: ["*"],
          resources: ["*"],
          verbs: ["*"],
        },
      ],
    },
    {
      provider: args.provider,
    }
  );

  const operatorRoleBinding = new kubernetes.rbac.v1.RoleBinding(
    `${project.name}-pulumi-operator-role-binding`,
    {
      metadata: {
        namespace,
      },
      subjects: [
        {
          kind: "ServiceAccount",
          name: operatorServiceAccount.metadata.name,
        },
      ],
      roleRef: {
        kind: "Role",
        name: operatorRole.metadata.name,
        apiGroup: "rbac.authorization.k8s.io",
      },
    },
    {
      provider: args.provider,
    }
  );

  const operatorName = `${project.name}-operator`;

  const operator = new kubernetes.apps.v1.Deployment(
    `${project.name}-pulumi-kubernetes-operator`,
    {
      metadata: {
        namespace,
      },
      spec: {
        replicas: 1,

        selector: {
          matchLabels: {
            name: operatorName,
          },
        },

        template: {
          metadata: {
            labels: {
              name: operatorName,
            },
          },
          spec: {
            serviceAccountName: operatorServiceAccount.metadata.name,
            securityContext: {
              fsGroup: 1000,
            },
            serviceAccount: args.serviceAccount?.metadata.name,
            containers: [
              {
                name: "operator",
                image: "pulumi/pulumi-kubernetes-operator:v1.4.0",
                args: ["--zap-level=error", "--zap-time-encoding=iso8601"],
                imagePullPolicy: "Always",
                env: [
                  {
                    name: "WATCH_NAMESPACE",
                    valueFrom: {
                      fieldRef: {
                        fieldPath: "metadata.namespace",
                      },
                    },
                  },
                  {
                    name: "POD_NAME",
                    valueFrom: {
                      fieldRef: {
                        fieldPath: "metadata.name",
                      },
                    },
                  },
                  {
                    name: "OPERATOR_NAME",
                    value: `${project.name}-operator`,
                  },
                  {
                    name: "GRACEFUL_SHUTDOWN_TIMEOUT_DURATION",
                    value: "5m",
                  },
                  {
                    name: "MAX_CONCURRENT_RECONCILES",
                    value: "1",
                  },
                  {
                    name: "PULUMI_INFER_NAMESPACE",
                    value: "1",
                  },
                ],
              },
            ],
            // Should be same or larger than GRACEFUL_SHUTDOWN_TIMEOUT_DURATION
            terminationGracePeriodSeconds: 300,
          },
        },
      },
    },
    {
      provider: args.provider,
      dependsOn,
    }
  );

  const accessToken = new kx.Secret(
    `${project.name}-token`,
    {
      stringData: { accessToken: project.accessToken },
    },
    {
      provider: args.provider,
    }
  );

  new kubernetes.apiextensions.CustomResource(
    `${project.name}-stack`,
    {
      apiVersion: "pulumi.com/v1",
      kind: "Stack",
      metadata: {
        namespace,
      },
      spec: {
        stack: `${project.org}/${project.name}/production`,
        projectRepo: project.repository,
        branch: project.reference || "refs/heads/main",
        repoDir: project.directory || ".",
        destroyOnFinalize: true,
        continueResyncOnCommitMatch: true,
        refresh: true,
        resyncFrequencySeconds: 60,
        envRefs: {
          PULUMI_ACCESS_TOKEN: {
            type: "Secret",
            secret: {
              name: accessToken.metadata.name,
              key: "accessToken",
            },
          },
        },
      },
    },
    {
      provider: args.provider,
      dependsOn: [operator],
    }
  );
};
