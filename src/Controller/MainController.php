<?php

namespace App\Controller;

use App\Form\AlbumType;
use App\Service\DownloaderInterface;
use App\Service\TagWriterInterface;
use App\Service\UUIDGeneratorInterface;
use PhpZip\Exception\ZipException;
use PhpZip\ZipFile;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;
use Symfony\Component\Routing\Annotation\Route;

class MainController extends AbstractController
{
    /**
     * @Route("/", name="home")
     */
    public function index(Request $request, DownloaderInterface $downloader, TagWriterInterface $tagWriter, UUIDGeneratorInterface $uuidGen)
    {
        $form = $this->createForm(AlbumType::class);

        $form->handleRequest($request);

        if ($form->isSubmitted() && $form->isValid()) {
            ini_set('max_execution_time', '10000000');
            $archive = new ZipFile();
            try {
                $tempFiles = [];
                $tracks = $form->get('tracks');
                foreach ($tracks as $track) {
                    $location = $track->get('url')->getData();
                    $file = $downloader->download($location);
                    array_push($tempFiles, $file);
                    $tagWriter->write($file, [
                        'cover' => 'nopicture.jpg',
                        'title' => $track->get('title')->getData(),
                        'album' => $form->get('title')->getData(),
                        'artist' => $form->get('artist')->getData()->getName(),
                        'year' => $form->get('year')->getData()
                    ]);
                    $filename = $track->get('number')->getData() . ' - ' . preg_replace('/[^a-z0-9]+/', '-', strtolower($track->get('title')->getData())) . '.mp3';
                    $archive->addFile($file, $filename);
                }

                $downloadDirectory = $downloader->getDownloadDirectory();
                $archiveFilename = $downloadDirectory . '/' . preg_replace('/[^a-z0-9]+/', '-', strtolower($form->get('title')->getData())) . $uuidGen->generate() . '.zip';
                $archive->saveAsFile($archiveFilename);

                foreach ($tempFiles as $tempFile) {
                    unlink($tempFile);
                }

                $response = new BinaryFileResponse($archiveFilename);
                $response->setContentDisposition(ResponseHeaderBag::DISPOSITION_ATTACHMENT);
                return $response;
            } catch (ZipException $e) {
                return new JsonResponse($e->getTrace());
            } finally {
                $archive->close();
            }
        }

        return $this->render('main/index.html.twig', [
            'form' => $form->createView()
        ]);
    }
}
