/** Session storage is copied into duplicated tabs. Only one tab may replay
 * and continue a recovered client ID, because acknowledgements use that ID. */
export function claimSharedBodyClient(
  clientId: string,
  recovering: boolean,
  locks = navigator.locks,
): Promise<() => void> {
  if (!locks) {
    if (recovering)
      return Promise.reject(
        new Error(
          'This browser cannot safely reopen the recovery copy. Download it and reopen the current body.',
        ),
      )
    return Promise.resolve(() => {})
  }
  return new Promise((resolve, reject) => {
    void locks
      .request(`ginko-cms/editor-client/${clientId}`, { ifAvailable: true }, (lock) => {
        if (!lock) {
          reject(
            new Error(
              'This editing session is already open in another tab. Use that tab, or download the recovery copy and reopen the current body.',
            ),
          )
          return
        }
        return new Promise<void>((release) => {
          resolve(release)
        })
      })
      .catch(reject)
  })
}
