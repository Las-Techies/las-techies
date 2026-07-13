
import fs from "fs";//fs to read files from disk
import path from "path";//path to get the file name
import { extractTextFromDocument } from "../services/documentProcessor";//import the function to extract text from the document

async function runOne(filePath: string, mimetype: string) {//function to run one test
  try {
    const buffer = fs.readFileSync(filePath);//read the file from the disk

    const text = await extractTextFromDocument({//extract the text from the document
      buffer,
      mimetype,
      originalname: path.basename(filePath),
    });

    console.log(`PASS: ${filePath}`);//log the file path
    console.log(`Length: ${text.length}`);//log the length of the text
    console.log(`Preview: ${text.slice(0, 120)}\n`);//log the preview of the text
  } catch (error) {
    console.log(`FAIL: ${filePath}`);//log the file path
    console.log((error as Error).message + "\n");//log the error message
  }
}

async function main() {//function to run the tests
  await runOne("samples/sample.txt", "text/plain");//run the test for the text file
  await runOne("samples/sample.pdf", "application/pdf");//run the test for the pdf file
  await runOne("samples/sample.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");//run the test for the docx file
  await runOne("samples/sample.png", "image/png"); // should fail: run the test for the png file
}

main();//run the tests
