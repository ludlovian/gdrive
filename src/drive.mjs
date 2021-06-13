import once from 'pixutil/once'
import driveApi from '@googleapis/drive'

export const getDriveAPI = once(async function getDriveAPI () {
  const scopes = ['https://www.googleapis.com/auth/drive']
  process.env.GOOGLE_APPLICATION_CREDENTIALS = 'credentials.json'
  const auth = new driveApi.auth.GoogleAuth({ scopes })
  const authClient = await auth.getClient()
  return driveApi.drive({ version: 'v3', auth: authClient })
})
