import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

type UploadedFile = {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
};

function getExtension(filename: string): string {//will get the .pdf, .docx, .doc, .txt, .csv, .xls, .xlsx, .ppt, .pptx
    const parts = filename.toLowerCase().split('.');
    return parts.length > 1 ? `.${parts.pop()}` : '';
}

//core text extractor function; checking the type, uses the right parser for that type, extracts the text, cleans it
//for unsupported types, throws an error and returns usable text for saving it to documents.raw_text

export async function extractTextFromDocument(file: UploadedFile): Promise<string> {
    const extension = getExtension(file.originalname);
    let text = "";

   if (extension === ".txt" || extension === ".md" || file.mimetype.startsWith("text/")) {
    //treat as text file
    text = file.buffer.toString("utf-8");
   } else if (extension === ".pdf" || file.mimetype ==="application/pdf") {
    //treat as pdf file
    const pdfData = await pdfParse(file.buffer);
    text = pdfData.text ?? "";//prevents runtime errors if pdfData.text is undefined
   } else if (extension === ".docx" || 
    file.mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    text = result.value ?? "";
  } else {
    throw new Error("Unsupported file type. Use .txt, .md, .pdf, or .docx");
  }

  //final text cleaning: removing extra whitespace, newlines, and formatting characters
  const cleaned = text.trim();
  if (!cleaned){
    throw new Error("No readable text found in document");
  }

  return cleaned;
}


