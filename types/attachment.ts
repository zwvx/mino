export interface Attachment {
    mimetype: string | 'unknown'
    data: Buffer 
    filename?: string
    size: number
}
