import { TYPERT } from '../host/typert.ts'

/** Browser-side projection of the host company's generated Remote manifest. */
export const TYPERT_REMOTE = {
  package: TYPERT.package,
  descriptors: TYPERT.invocations.map(({
    id, service, namespace, method, invocation, parameters, result,
  }) => ({
    id,
    service,
    namespace,
    method,
    invocation,
    parameters,
    result,
  })),
}
